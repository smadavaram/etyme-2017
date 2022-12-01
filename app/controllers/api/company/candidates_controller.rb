# frozen_string_literal: true

class Api::Company::CandidatesController < ApplicationController
  respond_to :json

  def get_resumes
    candidate = Candidate.find(params[:id])

    if candidate
      @resumes = candidate.candidates_resumes.paginate(page: params[:page], per_page: params[:per_page])
    else
      render json: { error: 'Cannot find candidate with this id' }, status: :not_found
    end
  end
end
