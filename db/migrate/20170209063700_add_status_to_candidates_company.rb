class AddStatusToCandidatesCompany < ActiveRecord::Migration
  def change
    add_column :candidates_companies ,:status ,:integer ,default: 0
  end
end
