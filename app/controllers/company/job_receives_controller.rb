class Company::JobReceivesController < Company::BaseController

  def index
    @received_jobs = current_company.passive_relationships.includes(:candidate, :shared_by).paginate(page: params[:page], per_page: 10) || []
  end

  def destroy
    SharedCandidate.where(id: params[:id]).destroy_all
    flash[:notice] = " Removed received candidate succeffully."
    redirect_to company_job_receives_path
  end

end
