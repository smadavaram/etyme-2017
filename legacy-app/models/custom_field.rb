# frozen_string_literal: true

# == Schema Information
#
# Table name: custom_fields
#
#  id                :integer          not null, primary key
#  name              :string
#  value             :string
#  status            :integer
#  customizable_id   :integer
#  customizable_type :string
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  required          :boolean          default(FALSE)
#
class CustomField < ApplicationRecord
  belongs_to :customizable, polymorphic: true, optional: true
  validates  :value, presence: true, on: :create, if: proc { |cf| cf.required && cf.customizable_type == 'JobApplication' }
  # validates  required:presence: :true,on: :update ,if
end
