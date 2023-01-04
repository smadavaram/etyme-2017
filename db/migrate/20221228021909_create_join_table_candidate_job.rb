class CreateJoinTableCandidateJob < ActiveRecord::Migration[5.2]
  def change
    create_join_table :candidates, :jobs do |t|
      t.index [:candidate_id, :job_id]
      t.index [:job_id, :candidate_id]
    end
  end
end
