package net.creasource.webflix

import net.creasource.json.JsonSupport
import net.creasource.tmdb.common.{Credits, Genre}
import spray.json.RootJsonFormat

case class Movie(
    id: Int,
    title: String,
    original_title: String,
    original_language: String,
    release_date: String,
    poster: Option[String],
    backdrop: Option[String],
    overview: String,
    vote_average: Float,
    files: Seq[LibraryFile with LibraryFile.Tags],
    details: Option[Movie.Details]) {

  def withDetails(details: Movie.Details): Movie = copy(details = Some(details))

}

object Movie extends JsonSupport {

  implicit val format: RootJsonFormat[Movie] = jsonFormat11(Movie.apply)

  case class Details(
      id: Int,
      budget: Int,
      genres: List[Genre],
      revenue: Int,
      runtime: Option[Int],
      tagline: Option[String],
      credits: Credits)

  object Details {

    implicit val format: RootJsonFormat[Details] = jsonFormat7(Details.apply)

  }

}
