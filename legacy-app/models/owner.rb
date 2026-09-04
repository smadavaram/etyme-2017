# frozen_string_literal: true

class Owner < ActiveRecord::Base
  belongs_to :user
end
