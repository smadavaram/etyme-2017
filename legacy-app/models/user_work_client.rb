# frozen_string_literal: true

# == Schema Information
#
# Table name: user_work_clients
#
#  id                  :bigint           not null, primary key
#  user_id             :bigint
#  name                :string
#  industry            :string
#  end_date            :date
#  start_date          :date
#  reference_name      :string
#  reference_phone     :string
#  reference_email     :string
#  project_description :text
#  role                :text
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#
class UserWorkClient < ApplicationRecord
  belongs_to :user
end
