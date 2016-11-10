class CreateJobInvitations < ActiveRecord::Migration
  def change
    create_table :job_invitations do |t|
      t.integer :recipient_id
      t.string  :email
      t.string  :recipient_type
      t.integer :created_by_id
      t.integer :job_id
      t.integer :status , default: 0

      t.timestamps null: false
    end
    # add_index :job_invitations, [:receipent_type , :receipent_id , :sender_id , :job_id]
  end
end
