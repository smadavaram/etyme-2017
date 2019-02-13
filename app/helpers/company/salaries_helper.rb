module Company::SalariesHelper

  def salary_status(salary)
    case salary.status
    when 'open'
      'calculate_salary();'
    when 'calculated'
      'commission_calculate();'
    when 'commission_calculated'
      'process_salary();'
    when 'processed'
      'aggregate_salary();'
    when 'aggregated'
      'clear_salary();'
    end
  end

  def company_expense(company_expense, contract, salary)
    company_expense.where(contract_id: contract.id).select { |m| m.salary_ids.include? salary.sclr_cycle_id.to_s }.map{|x| x.total_amount.to_i / x.salary_ids.length}.sum(&:to_i) if contract && salary
  end
end
