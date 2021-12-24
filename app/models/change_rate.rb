# frozen_string_literal: true

# == Schema Information
#
# Table name: change_rates
#
#  id            :bigint           not null, primary key
#  rateable_id   :integer
#  from_date     :date
#  to_date       :date
#  rate_type     :string
#  rate          :float
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  rateable_type :string
#  uscis         :float
#  working_hrs   :float
#  overtime_rate :float
#
class ChangeRate < ApplicationRecord
  belongs_to :rateable, polymorphic: true
  enum rate_type: %i[hourly daily weekly monthly]
  validate :validate_other_booking_overlap
  def self.instance_method_already_implemented?(method_name)
    return true if method_name == 'rate'
    super
  end
  def rate
    read_attribute(:rate)
  end 
  private

  def validate_other_booking_overlap
    sql = ':to_date >= from_date and to_date >= :from_date'
    is_overlapping = ChangeRate.where(rateable: rateable).where(sql, from_date: from_date, to_date: to_date).exists?
    errors.add(:base, :rate_period_overlap, message: 'Rate period must be non-overlapping with other rates') if is_overlapping
  end
end
