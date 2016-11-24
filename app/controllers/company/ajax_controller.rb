# AJAX helpers
class Company::AjaxController < Company::BaseController
  layout false

  def email_list
  end

  def email_compose
  end

  def email_opened
  end

  def email_reply
  end

  def demo_widget
  end

  def data_list
  end

  def notify_mail
  end

  def notify_notifications
    @notifications=current_user.notifications.all
  end

  def notify_tasks
  end
end
