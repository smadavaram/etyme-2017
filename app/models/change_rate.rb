class ChangeRate < ApplicationRecord
  belongs_to :contract

  def self.rate(date, contract_id)
    date_ranges = ChangeRate.where(contract_id: contract_id).pluck(:from_date, :to_date, :rate)
    rate = date_ranges.map{|x| x[2] if date.between?(x[0], x[1])}.compact.first
  end
end
