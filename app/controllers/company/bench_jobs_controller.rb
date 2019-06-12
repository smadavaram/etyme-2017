class Company::BenchJobsController < Company::BaseController

  def index
    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id )
  end

end