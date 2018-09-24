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

  def salary_settlement_monthly_time(contract)
    pay_day = current_company.payroll_infos.first.payroll_date.strftime("%d").to_i
    current_month = Date.today.strftime("%m").to_i
    payable_month = current_month-1 == 0 ? 12 : current_month-1 
    # months = (contract.start_date..contract.end_date).map{ |date| date.strftime("%m").to_i }.uniq
    if Date.today > contract.start_date && Date.today.strftime("%d").to_i > pay_day && current_month > contract.start_date.strftime('%m').to_i
      Timesheet.where(contract_id: contract.id).where('extract(month from end_date) = ?', payable_month).order(end_date: :asc).sum(:total_time)
    end
  end
end

