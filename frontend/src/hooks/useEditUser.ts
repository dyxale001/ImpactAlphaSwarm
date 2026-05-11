import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export function useEditUser(userId: string | undefined) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: ''
  });

  useEffect(() => {
    if (!userId) return;
    
    async function loadUser() {
      const { data, error } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();
        
      if (error) {
        setError("Failed to load user details");
      } else if (data) {
        setFormData({ first_name: data.first_name, last_name: data.last_name });
      }
      setLoading(false);
    }
    
    loadUser();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    
    setSaving(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        first_name: formData.first_name, 
        last_name: formData.last_name 
      })
      .eq('id', userId)
      .select()
      .single();
      
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
    } else {
      navigate('/admin');
    }
  };

  return { loading, saving, error, formData, setFormData, handleSubmit };
}