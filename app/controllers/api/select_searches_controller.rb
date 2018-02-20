class Api::SelectSearchesController < ApplicationController
  respond_to :json

  def find_companies
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @companies
  end

  def find_job_applicants
    job = Job.find(params[:job_id])
    @candidates = job.job_applications.paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @candidates
  end

  def find_user_sign
    @companies = Company.like_any([:name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    @candidates = Candidate.like_any([:first_name, :last_name], params[:q].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with [@companies, @candidates]
  end

end
