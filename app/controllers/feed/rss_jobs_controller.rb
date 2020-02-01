# frozen_string_literal: true

class Feed::RssJobsController < ApplicationController
  layout 'company'
  add_breadcrumb 'Dashboard', :dashboard_path

  def feeds
    add_breadcrumb 'Feeds Integration'
  end

  def bench_feed
    @company = Company.find_by(id: params[:company_id])
    @candidates = params[:company_id].present? ?
                      Candidate.where(id: CandidatesCompany.hot_candidate.where(company_id: params[:company_id]).pluck(:candidate_id)) :
                      Candidate.where(id: CandidatesCompany.hot_candidate.pluck(:candidate_id))
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), bench: @candidates.as_json(include: :invited_by_user) } }
    end
  end

  def job_feed
    @jobs = Job.active.is_public.where(listing_type: 'Job').where(status: 'Published')
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      @jobs = @jobs.find(params[:job_id]) if params[:job_id].present?
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), jobs: @jobs } }
    end
  end

  def blog_feed
    @jobs = Job.where(listing_type: 'Blog').where(status: 'Published')
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      @jobs = @jobs.find(params[:job_id]) if params[:job_id].present?
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), jobs: @jobs } }
    end
  end

  def product_feed
    @jobs = Job.where(listing_type: 'Product').where(status: 'Published')
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      @jobs = @jobs.find(params[:job_id]) if params[:job_id].present?
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), jobs: @jobs } }
    end
  end

  def service_feed
    @jobs = Job.where(listing_type: 'Service').where(status: 'Published')
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      @jobs = @jobs.find(params[:job_id]) if params[:job_id].present?
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), jobs: @jobs } }
    end
  end

  def training_feed
    @jobs = Job.where(listing_type: 'Training').where(status: 'Published')
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      @jobs = @jobs.find(params[:job_id]) if params[:job_id].present?
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render layout: false }
      format.json { render json: { company: @company.as_json(include: :company_videos), jobs: @jobs } }
    end
  end
end
