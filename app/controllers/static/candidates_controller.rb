class Static::CandidatesController < ApplicationController
  layout 'static'

  before_action :find_candidate ,only: [:resume,:send_message]

  def resume
    render layout: 'resume'
  end

  def send_message
    UserMailer.send_message_to_candidate(params[:name] ,params[:subject],params[:message],@candidate,params[:email]).deliver()
    flash[:success] = "Message sent successfully."
    redirect_to :back
  end

  private

  def find_candidate
    @candidate = Candidate.find(params[:candidate_id])
  end

end
