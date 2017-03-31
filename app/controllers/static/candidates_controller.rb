class Static::CandidatesController < ApplicationController
  layout 'static'

  before_action :find_candidate ,only: [:resume]

  def resume
    render layout: 'resume'
  end

  private

  def find_candidate
    @candidate = Candidate.find(params[:candidate_id])
  end

end
