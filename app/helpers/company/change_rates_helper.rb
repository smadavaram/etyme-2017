# frozen_string_literal: true

module Company::ChangeRatesHelper
  def get_rate(date, contract_id, type)
    ChangeRate.date_range(date, contract_id, type)
  end
end
