class Users::SubscriptionsController < ApplicationController
  before_action :authenticate_user!

  def subscribe
    if current_user.subscribed?(params[:company_id])
      current_user.user_company(params[:company_id]).subscribed!
      redirect_to request.referrer, success: 'You are now subscribed'
    else
      CompanyContact.create(user_id: current_user.id,
                            company_id: params[:company_id],
                            user_company_id: current_user.company.id,
                            first_name: current_user.first_name,
                            last_name: current_user.last_name,
                            email: current_user.email,
                            created_by_id: current_user.id,
                            user_status: 1
      )
      redirect_to request.referrer, success: 'subscription created'
    end
  end

  def unsubscribe
    current_user.user_company(params[:company_id]).unsubscribed!
    redirect_to request.referrer, notice: 'You are now unsubscribed'
  end


end
