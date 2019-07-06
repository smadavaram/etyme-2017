class Company::InterviewsController < Company::BaseController
  before_action :set_job_application
  before_action :set_candidate

  def new
    @interview = @job_application.interviews.where(pa)
  end

  private
  def set_job_application
    @job_application = current_company.job_applications.find_by(id: params[:id])
  end
end