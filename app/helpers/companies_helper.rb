module CompaniesHelper

  # Job Invitation set table row color
  def set_background_status_color status
    if status == 'accepted'
      return 'success'
    elsif status == 'rejected'
      return 'danger'
    elsif status == 'pending'
      return 'primary'
    end

  end
end
