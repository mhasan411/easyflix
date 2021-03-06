package net.easyflix.app
import java.io.File

import akka.actor.{ActorRef, ActorSystem, Props}
import akka.http.scaladsl.Http
import akka.http.scaladsl.model.{HttpRequest, HttpResponse, StatusCodes}
import akka.http.scaladsl.server.Directives.pathPrefix
import akka.http.scaladsl.server.Route
import akka.stream.{ActorMaterializer, KillSwitches, SharedKillSwitch}
import akka.util.ByteString
import cats.Show
import cats.effect.IO
import cats.implicits._
import com.typesafe.config.{Config, ConfigFactory}
import net.easyflix.actors.{LibrarySupervisor, SocketActor, TMDBActor}
import net.easyflix.app.ProdConfiguration.ConfigError
import net.easyflix.events.ApplicationBus
import net.easyflix.exceptions.ConfigurationException
import net.easyflix.http.actors.{SocketSinkActor, SocketSinkSupervisor}
import net.easyflix.model.TMDBConfiguration
import net.easyflix.routes.Routes
import net.easyflix.tmdb
import org.slf4j.Logger

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

object ProdApplication extends ProdApplication(None, None, None, None, None)

class ProdApplication(
    port: Option[Int] = None,
    host: Option[String] = None,
    tmdbApiKey: Option[String] = None,
    authKey: Option[String] = None,
    password: Option[String] = None
) extends Application[(Logger, SharedKillSwitch, Http.ServerBinding)] {

  def createSocketProps(conf: ProdConfiguration, bus: ApplicationBus, apiRoute: Route, mat: ActorMaterializer): IO[Props] =
    IO {
      val socketActorProps: Props = SocketActor.props(pathPrefix("api")(Route.seal(apiRoute)), bus, conf)(mat)
      SocketSinkActor.props(socketActorProps)(mat)
    }

  def createVideosRoute(libs: ActorRef): IO[Route] =
    IO { Routes.createVideosRoute(libs) }

  def createApiRoute(
      libs: ActorRef,
      tmdb: ActorRef): IO[Route] =
    IO { Routes.createApiRoute(libs, tmdb) }

  def createRoute(
      conf: ProdConfiguration,
      api: Route,
      vid: Route,
      ss: ActorRef,
      sp: Props,
      sk: SharedKillSwitch): IO[Route] =
    IO { Routes.createRoute(conf, api, vid, ss, sp, sk) }

  val createSocketKillSwitch: IO[SharedKillSwitch] =
    IO.pure(KillSwitches.shared("sockets"))

  val createApplicationBus: IO[ApplicationBus] =
    IO.pure(new ApplicationBus)

  def createSocketSupervisor(sys: ActorSystem): IO[ActorRef] =
    IO { sys.actorOf(SocketSinkSupervisor.props(), "sockets") }

  def createLibrariesActor(bus: ApplicationBus, sys: ActorSystem, mat: ActorMaterializer): IO[ActorRef] =
    IO { sys.actorOf(LibrarySupervisor.props(bus)(mat), "libraries") }

  def createTmdbActor(tmdbConf: TMDBConfiguration, bus: ApplicationBus, conf: ProdConfiguration, sys: ActorSystem, mat: ActorMaterializer): IO[ActorRef] =
    IO { sys.actorOf(TMDBActor.props(tmdbConf, bus, conf)(mat), "tmdb") }

  def startServer(
      host: String,
      port: Int,
      routes: Route)(implicit sys: ActorSystem, mat: ActorMaterializer): IO[Http.ServerBinding] =
    IO.fromFuture(IO(Http().bindAndHandle(Route.handlerFlow(routes), host, port)))

  def loadTmdbConfig(c: ProdConfiguration)(implicit sys: ActorSystem, mat: ActorMaterializer): IO[TMDBConfiguration] = {
    import spray.json.DefaultJsonProtocol._
    import spray.json._
    implicit val ec: ExecutionContext = sys.dispatcher
    def makeRequest[A: RootJsonReader](uri: String): Future[A] =
      Http().singleRequest(HttpRequest(uri = s"https://api.themoviedb.org$uri")).transformWith {
        case Success(HttpResponse(StatusCodes.OK, _, entity, _)) =>
          entity.dataBytes.runFold(ByteString(""))(_ ++ _).map { body =>
            body.utf8String.parseJson.convertTo[A]
          }
        case Success(HttpResponse(code, _, entity, _)) =>
          entity.discardBytes()
          Future.failed(new Exception(s"Could not retrieve TMDB configuration. Response code is: $code"))
        case Failure(exception) => Future.failed(exception)
      }
    def loadConfiguration(key: String): IO[tmdb.Configuration] =
      IO.fromFuture(IO(makeRequest[tmdb.Configuration](tmdb.Configuration.get(key))))
    def loadLanguages(key: String): IO[tmdb.Configuration.Languages] =
      IO.fromFuture(IO(makeRequest[tmdb.Configuration.Languages](tmdb.Configuration.Language.get(key))))
    for {
      conf <- loadConfiguration(c.tmdbApiKey)
      lang <- loadLanguages(c.tmdbApiKey)
    } yield TMDBConfiguration(conf.images, lang)
  }

  val parseConfiguration: IO[ProdConfiguration] = {
    implicit val show: Show[ConfigError] = (t: ConfigError) => t.msg
    def parse(conf: Config): Either[ConfigurationException, ProdConfiguration] =
      ProdConfiguration.validateConf(
        conf = conf,
        port = port,
        host = host,
        tmdbApiKey = tmdbApiKey,
        authKey = authKey,
        None,
        password = password
      ).toEither.left.map { errorChain =>
        val message = errorChain.mkString_("\n")
        ConfigurationException(message)
      }
    for {
      c <- IO {
        ConfigFactory.invalidateCaches()
        val f = ConfigFactory.parseFile(new File("./easyflix.conf"))
        val r = ConfigFactory.load("easyflix-reference")
        f.withFallback(r)
      }
      r <- IO.fromEither(parse(c))
    } yield r
  }

  // TODO make system and mat implicit
  override def acquire(
      log: Logger,
      sys: ActorSystem,
      mat: ActorMaterializer): IO[(Logger, SharedKillSwitch, Http.ServerBinding)] =
    for {
         _ <- IO(log.info("Parsing configuration"))
         c <- parseConfiguration
         _ <- IO(log.info("Creating top actors and routes"))
       bus <- createApplicationBus
        sk <- createSocketKillSwitch
        ss <- createSocketSupervisor(sys)
      libs <- createLibrariesActor(bus, sys, mat)
         _ <- IO(log.info("Loading TMDb configuration"))
        tc <- loadTmdbConfig(c)(sys, mat)
      tmdb <- createTmdbActor(tc, bus, c, sys, mat)
       api <- createApiRoute(libs, tmdb)
       vid <- createVideosRoute(libs)
        sp <- createSocketProps(c, bus, api, mat)
      rout <- createRoute(c, api, vid, ss, sp, sk)
         _ <- IO(log.info("Starting server"))
       hsb <- startServer(c.host, c.port, rout)(sys, mat)
         _ <- IO(log.info(s"Server online at http://${c.host}:${c.port}"))
    } yield (log, sk, hsb)

  override def release: ((Logger, SharedKillSwitch, Http.ServerBinding)) => IO[Unit] = { case (log, ks, hsb) =>
    for {
      _ <- IO(log.info("Stopping server"))
      _ <- IO.fromFuture(IO(hsb.unbind())) // Unbind = accept no new connections
      _ <- IO(ks.shutdown())
      _ <- IO.fromFuture(IO(hsb.terminate(10.seconds)))
    } yield ()
  }
}
