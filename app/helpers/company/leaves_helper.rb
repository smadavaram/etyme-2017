module Company::LeavesHelper
  def set_background_status_color status
    if status == 'accepted'
      return 'success'
    elsif status == 'rejected'
      return 'danger'
    elsif status == 'pending'
      return 'primary'
    end

  end

  def leave_status_color status
    color = "<span class ='span label label-"
    if status == 'accepted'
      color += "success'>#{status.to_s.titleize}</span>"
    elsif status == 'rejected'
      color += "danger'>#{status.to_s.titleize}</span>"
    elsif status == 'pending'
      color += "info'>#{status.to_s.titleize}</span>"
    end
    raw(color)
  end
end
