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
      'clear_salary();'
    when 'aggregated'
      'clear_salary();'
    end
  end
end
