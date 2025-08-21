# frozen_string_literal: true

module Company::JobInvitationsHelper
  def invitation_status_color(status)
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
