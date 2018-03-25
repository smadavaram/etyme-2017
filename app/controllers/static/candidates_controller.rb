class Static::CandidatesController < ApplicationController
  layout 'static'

  before_action :find_candidate ,only: [:resume,:send_message]

  def resume
    render layout: 'resume'
  end

  def send_message
    @to = params.has_key?(:company_id) ? (@candidate.invited_by.present?  ? @candidate.invited_by : Company.find(params[:company_id]).owner ) : @candidate
    UserMailer.send_message_to_candidate(params[:name] ,params[:subject],params[:message],@to,params[:email]).deliver()
    flash[:success] = "Message sent successfully."
    redirect_back fallback_location: root_path
  end

  private

  def find_candidate
    @candidate = Candidate.find(params[:candidate_id])
  end

end
