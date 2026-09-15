# frozen_string_literal: true

# == Schema Information
#
# Table name: user_certificates
#
#  id         :bigint           not null, primary key
#  user_id    :bigint
#  end_date   :date
#  start_date :date
#  institute  :string
#  title      :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class UserCertificate < ApplicationRecord
  belongs_to :user
end
