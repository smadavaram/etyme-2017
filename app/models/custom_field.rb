# frozen_string_literal: true

class CustomField < ApplicationRecord
  belongs_to :customizable, polymorphic: true, optional: true
  validates  :value, presence: true, on: :create, if: proc { |cf| cf.required && cf.customizable_type == 'JobApplication' }
  # validates  required:presence: :true,on: :update ,if
end
