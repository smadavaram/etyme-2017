# frozen_string_literal: true

class Candidate::NotificationsController < Candidate::BaseController
  before_action :set_user

  def read
    @notification = @candidate.notifications.find_by(id: params[:id])
    if @notification.read!
      flash[:success] = 'Status Changed Successfully'
    else
      flash[:errors] = @notification.errors.full_messages
    end
  end

  def destroy
    @notification = @candidate.notifications.find_by(id: params[:id])
    type = @notification.notification_type
    status = @notification.status
    if @notification.destroy
      flash[:success] = 'Successfully Deleted'
      redirect_to notify_notifications_candidates_path(status: status, notification_type: type)
    else
      flash[:error] = 'Something went wrong'
      redirect_back(fallback_location: root_path)
    end
  end

  def set_user
    @candidate = Candidate.find_by(id: params[:candidate_id])
  end
end
