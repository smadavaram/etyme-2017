# frozen_string_literal: true

class Candidate::SubscriptionsController < Candidate::BaseController
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  def index
    add_breadcrumb 'Subscriptions'
    
    @subscriptions  = current_candidate.companies
  end


  private

end
