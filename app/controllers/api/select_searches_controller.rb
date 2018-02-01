class Api::SelectSearchesController < ApplicationController
  respond_to :json

  def find_companies
    @companies = Company.like_any([:name], params[:q][:name_cont].to_s.split).paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @companies
  end

  def find_job_applicants
    job = Job.find(params[:q][:job_id])
    @candidates = job.job_applications.paginate(:page => params[:page], :per_page => params[:per_page])
    respond_with @candidates
  end

end
