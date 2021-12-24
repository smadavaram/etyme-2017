# frozen_string_literal: true

class Candidate::SubscriptionsController < Candidate::BaseController
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  def index
    add_breadcrumb 'Subscriptions'
    
    @subscriptions  = current_candidate.companies
  end


  def subscribe
      if current_candidate.subscribed?(params[:company_id])
        current_candidate.candidate_company.subscribed!
        redirect_to request.referrer, success: 'You are now subscribed'
      else
        CandidatesCompany.create(candidate_id: current_candidate.id,
                                 company_id: params[:company_id],
                                 candidate_status: 1
        )
        redirect_to request.referrer, success: 'subscription created'
      end
  end

  def unsubscribe
    cc = CandidatesCompany.where(candidate_id: current_candidate.id ,
                             company_id: params[:company_id],
    ).first
    cc.unsubscribed!
    redirect_to request.referrer, notice: 'You are now unsubscribed'
  end

  private

end
