module ActiveRecord
  class Relation
    alias_method :total_count, :count
  end
end