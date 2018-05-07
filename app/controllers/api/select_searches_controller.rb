class Api::SelectSearchesController < ApplicationController
  respond_to :json

  def find_companies
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @companies
  end

  def find_candidates
    @candidates = Candidate.like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @candidates
  end

  def find_contacts
    @contacts = current_company.company_contacts.like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @contacts
  end

  def find_jobs
    @jobs = current_company.jobs.like_any([:title], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @jobs
  end

  def find_job_applicants
    job = Job.find(params[:job_id])
    ids = job.job_applications.where(applicationable_type: "Candidate").pluck(:applicationable_id)
    @candidates = Candidate.where(id: ids).like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @candidates
  end

  def find_user_sign
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    @candidates = Candidate.like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with [@companies, @candidates]
  end

  def find_commission_user
    @commission_users = current_company.admins.like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @commission_users
  end

end
