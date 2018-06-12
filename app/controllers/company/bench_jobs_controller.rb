class Company::BenchJobsController < Company::BaseController

  def index
    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id ).paginate(:page => params[:page], :per_page => 30)
  end

end