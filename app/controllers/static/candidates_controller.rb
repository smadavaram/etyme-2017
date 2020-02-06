# frozen_string_literal: true

class Static::CandidatesController < ApplicationController
  layout 'static'

  before_action :find_candidate, only: %i[resume send_message]

  def resume
    render layout: 'resume'
  end

  def send_message
    @to = params.key?(:company_id) ? (@candidate.invited_by.present? ? @candidate.invited_by : Company.find(params[:company_id]).owner) : @candidate
    UserMailer.send_message_to_candidate(params[:name], params[:subject], params[:message], @to, params[:email]).deliver_later
    flash[:success] = 'Message sent successfully.'
    redirect_back fallback_location: root_path
  end

  def candidate_profile
    @candidate = Candidate.find_by(id: params[:id])
    redirect_back(fallback_location: root_path) unless @candidate
  end

  private

  def find_candidate
    @candidate = Candidate.find_by(id: params[:candidate_id])
  end
end
