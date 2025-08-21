class AddCreatedByCandidateToComments < ActiveRecord::Migration[5.1]
  def change
    add_column :comments, :created_by_candidate_id, :integer
  end
end
