# frozen_string_literal: true

class ChangeRate < ApplicationRecord
  belongs_to :rateable, polymorphic: true
  enum rate_type: %i[hourly daily weekly monthly]
  validate :validate_other_booking_overlap

  private

  def validate_other_booking_overlap
    sql = ':to_date >= from_date and to_date >= :from_date'
    is_overlapping = ChangeRate.where(rateable: rateable).where(sql, from_date: from_date, to_date: to_date).exists?
    errors.add(:base, :rate_period_overlap, message: 'Rate period must be non-overlapping with other rates') if is_overlapping
  end
end
