class Api::Candidate::CandidatesController < ApplicationController
  respond_to :json

  def contract_cycles
    @contract = Contract.find(params[:contract_id])
    if @contract
      render locals: {cycles: @contract.contract_cycles}, status: :ok
    else
      render json: {error: "Cannot find contract with this id"}, status: :not_found
    end
  end

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
