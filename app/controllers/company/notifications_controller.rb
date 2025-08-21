# frozen_string_literal: true

class Company::NotificationsController < Company::BaseController
  before_action :set_user

  def read
    @notification = @user.notifications.find_by(id: params[:id])
    if @notification.read!
      flash[:success] = 'Status Changed Successfully'
    else
      flash[:errors] = @notification.errors.full_messages
    end
  end

  def destroy
    @notification = @user.notifications.find_by(id: params[:id])
    type = @notification.notification_type
    status = @notification.status
    if @notification.destroy
      flash[:success] = 'Successfully Deleted'
      redirect_to notify_notifications_company_users_path(status: status, notification_type: type)
    else
      flash[:error] = 'Something went wrong'
      redirect_back(fallback_location: root_path)
    end
  end

  def set_user
    @user = current_company.users.find_by(id: params[:user_id])
  end
end
