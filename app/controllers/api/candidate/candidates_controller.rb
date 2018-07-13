class Api::Candidate::CandidatesController < ApplicationController
  respond_to :json

  def add_candidate
    candidate = Candidate.new()

    candidate.email = params["candidate"]["email"]
    candidate.phone = params["candidate"]["phone"]
    candidate.first_name = params["candidate"]["first_name"]
    candidate.last_name = params["candidate"]["last_name"]
    candidate.gender = params["candidate"]["gender"]
    candidate.password = params["candidate"]["password"]
    candidate.password_confirmation = params["candidate"]["password_confirmation"]

    if candidate.save
  		render json: {message: "Candidate created sucessfully", data: {params: candidate}}
    else
    	render json: {message: "Somthing went wrong", data: {params: candidate.errors}}
    end
  end
    

end
