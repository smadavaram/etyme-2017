# == Schema Information
#
# Table name: coupons
#
#  id             :bigint           not null, primary key
#  name           :string
#  validated_till :datetime
#  used_times     :integer
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#
class Coupon < ApplicationRecord
end
