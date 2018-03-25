class Company::PublicJobsController < Company::BaseController

  def index
    @jobs = Job.joins("INNER JOIN candidates on jobs.industry = candidates.industry AND jobs.department = candidates.department").where("candidates.id in (?)", current_company.candidates.pluck(:id)).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
  end

  def job
    @job = Job.find(params[:id])
  end

end
