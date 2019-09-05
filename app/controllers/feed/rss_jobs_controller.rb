class Feed::RssJobsController < ApplicationController
  layout 'company'

  def feeds
  end

  def bench_feed
    @company = Company.find_by(id: params[:company_id])
    @candidates = Candidate.where(id: CandidatesCompany.hot_candidate.where(company_id: params[:company_id]).pluck(:candidate_id))
    respond_to do |format|
      format.rss {render :layout => false}
      format.json {render :json => {company: @company.as_json(include: :company_videos),bench: @candidates.as_json(include: :invited_by_user)}}
    end
  end

 def job_feed
    @jobs = Job.active.is_public.where(:listing_type=>"Job").where(:status =>"Published")
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      if params[:job_id].present?
        @jobs = @jobs.find(params[:job_id])
      end
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render :layout => false }
      format.json { render :json => {company: @company.as_json(include: :company_videos), jobs: @jobs} }
    end
 end
  def blog_feed
    @jobs = Job.active.is_public.where(:listing_type=>"Blog").where(:status =>"Published")
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      if params[:job_id].present?
        @jobs = @jobs.find(params[:job_id])
      end
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render :layout => false }
      format.json { render :json => {company: @company.as_json(include: :company_videos), jobs: @jobs} }
    end
  end

  def product_feed
    @jobs = Job.where(:listing_type=>"Product").where(:status =>"Published")
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      if params[:job_id].present?
        @jobs = @jobs.find(params[:job_id])
      end
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render :layout => false }
      format.json { render :json => {company: @company.as_json(include: :company_videos), jobs: @jobs} }
    end
  end

  def service_feed
    @jobs = Job.where(:listing_type=>"Service").where(:status =>"Published")
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      if params[:job_id].present?
        @jobs = @jobs.find(params[:job_id])
      end
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render :layout => false }
      format.json { render :json => {company: @company.as_json(include: :company_videos), jobs: @jobs} }
    end
  end

  def training_feed
    @jobs = Job.where(:listing_type=>"Training").where(:status =>"Published")
    if params[:company_id].present?
      @jobs = @jobs.where(company_id: params[:company_id])
      if params[:job_id].present?
        @jobs = @jobs.find(params[:job_id])
      end
      @company = Company.find(params[:company_id])
    end
    respond_to do |format|
      format.rss { render :layout => false }
      format.json { render :json => {company: @company.as_json(include: :company_videos), jobs: @jobs} }
    end
  end

end
