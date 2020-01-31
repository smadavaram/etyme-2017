# frozen_string_literal: true

class Company::BenchJobsController < Company::BaseController
  add_breadcrumb 'Dashboard', :dashboard_path

  def index
    add_breadcrumb 'My Bench'

    @candidates = CandidatesCompany.hot_candidate.where(company_id: current_company.id)
  end
end
