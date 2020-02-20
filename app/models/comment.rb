# frozen_string_literal: true

class Comment < ApplicationRecord
  belongs_to :commentable, polymorphic: true, optional: true
  belongs_to :created_by, class_name: 'User', foreign_key: :created_by_id, optional: true
end
