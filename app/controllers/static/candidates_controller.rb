# frozen_string_literal: true

class Static::CandidatesController < ApplicationController
  layout 'static'

  before_action :find_candidate, only: %i[resume send_message]
  before_action :auth_user!, only: %i[candidate_profile]


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
    if current_company.nil?
      flash[:alert] = 'Please try with company domain.'
      return redirect_to root_path
    end

    @candidates_hot    = []
    @candidates_hot    = CandidatesCompany.hot_candidate.where(company_id: current_company.id).first(3) unless current_company.nil?
    @jobs_hot          = current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    @candidate_company = current_company.candidates_companies.includes(:candidate).find_by(candidate_id: params[:id])
    @candidate         = @candidate_company.candidate
    @rating_categories = RatingCategory.all.order(:name)

    @can_review  = current_user && @candidate.clients.map(&:refrence_email).map{|email| email.split("@").last }.include?(current_user&.email&.split("@").last)

    # TODO: Where should be fetched projects?
    # @company_projects  =

    if (params[:is_chat_candidate].present? && params[:is_chat_candidate] == "true")
      flash[:alert] = 'Please login with Company ID.'
    end

    unless @candidate
      redirect_back(fallback_location: root_path)
    else
      render :layout => "kulkakit"
    end
  end

  private

  def auth_user!
    redirect_to request.referrer, notice: "Please login to see details" if current_company.nil? and current_candidate.nil?
  end

  def find_candidate
    @candidate = Candidate.find_by(id: params[:candidate_id])
  end
end
