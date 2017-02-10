module Company::ContractsHelper
  def show_recipient_name contractable
    return "" if contractable.nil?
    if contractable.class.name == "Candidate"
      contractable.full_name
    else
      contractable.try(:name)
    end
  end

  def show_recipient_picture contractable
    return "default_user.png" if contractable.nil?
    if contractable.class.name == "Candidate"
      contractable.try(:photo)
    else
      if contractable.try(:logo).nil?
        return "default_user.png"
      else
        contractable.try(:logo)
      end
    end
  end

  def is_applicant_is_consultant? job_application
    (job_application.present? && job_application.is_candidate_applicant? &&  current_company.consultants.where(candidate_id: job_application.applicationable_id).present?)
  end
end
