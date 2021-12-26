# frozen_string_literal: true

class Candidate::SubscriptionsController < Candidate::BaseController
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  def index
    add_breadcrumb 'Subscriptions'
    
    @subscriptions  = current_candidate.companies
  end


  def subscribe
      if current_candidate.subscribed?(params[:company_id])
        current_candidate.candidate_company(params[:company_id]).subscribed!
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
    current_candidate.candidate_company(params[:company_id]).unsubscribed!
    redirect_to request.referrer, notice: 'You are now unsubscribed'
  end


  def user_subscribe
    if current_user.subscribed?(params[:company_id])
      current_user.user_company(params[:company_id]).subscribed!
    else
      CompanyContact.create(user_id: current_user.id,
                               company_id: params[:company_id],
                               user_company_id:current_user.company_id,
                               first_name: current_user.first_name,
                               last_name: current_user.last_name,
                               email:current_user.email,
                               user_status: 1
      )
      redirect_to request.referrer, success: 'subscription created'
    end
  end

  def user_unsubscribe
    current_user.user_company(params[:company_id]).subscribed!
    redirect_to request.referrer, notice: 'You are now unsubscribed'
  end




  private

end
