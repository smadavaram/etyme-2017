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
  
  def frequency_to_num(frequency)
    {"daily": 1, "weekly": 4, "biweekly": 8, "monthly": 1, "twice a month": 2}[frequency.to_sym]
  end
  
  def is_applicant_is_consultant? job_application
    (job_application.present? && job_application.is_candidate_applicant? && current_company.consultants.where(candidate_id: job_application.applicationable_id).present?)
  end
  
  def cyclable_link(contract_cycle)
    case contract_cycle.cycle_type
      when "TimesheetSubmit"
        return link_to contract_cycle.cyclable_type, get_cyclable_contracts_path(cyclable_id: contract_cycle.cyclable_id, cyclable_type: contract_cycle.cyclable_type), remote: :true, :style => 'color:#FFFFFF;'
      when "InvoiceGenerate"
        return link_to contract_cycle.cycle_type, edit_invoice_path(contract_cycle.cyclable), :style => 'color:#FFFFFF;'
      when "ClientExpenseSubmission"
        return link_to contract_cycle.cycle_type, edit_client_expense_path(contract_cycle.cyclable), :style => 'color:#FFFFFF;'
      when "ClientExpenseInvoice"
        return link_to contract_cycle.cycle_type, client_expense_invoice_invoice_path(contract_cycle.cyclable), :style => 'color:#FFFFFF;'
      else
        return contract_cycle.cycle_type.tableize.singularize.split("_").join(" ").capitalize
    end
  end
  
  
  def salary_settlement_monthly_time(contract)
    pay_day = current_company.payroll_infos.first.payroll_date.strftime("%d").to_i
    current_month = Date.today.strftime("%m").to_i
    payable_month = current_month - 1 == 0 ? 12 : current_month - 1
    # months = (contract.start_date..contract.end_date).map{ |date| date.strftime("%m").to_i }.uniq
    if Date.today > contract.start_date && Date.today.strftime("%d").to_i > pay_day && current_month > contract.start_date.strftime('%m').to_i
      Timesheet.where(contract_id: contract.id).where('extract(month from end_date) = ?', payable_month).order(end_date: :asc).sum(:total_time)
    end
  end
end

