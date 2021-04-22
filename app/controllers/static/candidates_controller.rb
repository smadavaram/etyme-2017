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
    @current_company  = Company.find_by(slug: request.subdomain)
    @candidates_hot   = []
    @candidates_hot   = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).first(3) unless @current_company.nil?
    @jobs_hot         = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    @candidate        = Candidate.find_by(id: params[:id])

    if (params[:is_chat_candidate].present? && params[:is_chat_candidate] == "true")
      flash.now[:alert] = 'Please login with Company ID'
    end

    unless @candidate
      redirect_back(fallback_location: root_path)
    else
      render :layout => "kulkakit"
    end
  end

  private

  def find_candidate
    @candidate = Candidate.find_by(id: params[:candidate_id])
  end
end
