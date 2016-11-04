class CreateJobInvitations < ActiveRecord::Migration
  def change
    create_table :job_invitations do |t|
      t.integer :receipent_id
      t.string  :receipent_type
      t.integer :sender_id
      t.integer :job_id
      t.integer :status , default: 0

      t.timestamps null: false
    end
    add_index :job_invitations, [:receipent_type , :receipent_id , :sender_id , :job_id]
  end
end
